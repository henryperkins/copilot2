import { ABORT_REASON, AI_SENDER, EMPTY_INDEX_ERROR_MESSAGE, LOADING_MESSAGES } from "@/constants";
import { getSystemPrompt } from "@/settings/model";
import { ChatMessage } from "@/sharedState";
import { ToolManager } from "@/tools/toolManager";
import {
  extractChatHistory,
  extractUniqueTitlesFromDocs,
  extractYoutubeUrl,
  formatDateTime,
} from "@/utils";
import { Notice } from "obsidian";
import ChainManager from "./chainManager";
import { COPILOT_TOOL_NAMES, IntentAnalyzer } from "./intentAnalyzer";

export interface ChainRunner {
  run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
      isO1Model?: boolean; // isO1Model added to the interface
    }
  ): Promise<string>;
}

abstract class BaseChainRunner implements ChainRunner {
  constructor(protected chainManager: ChainManager) {}

  abstract run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
      isO1Model?: boolean;
    }
  ): Promise<string>;

  protected async handleResponse(
    fullAIResponse: string,
    userMessage: ChatMessage,
    abortController: AbortController,
    addMessage: (message: ChatMessage) => void,
    updateCurrentAiMessage: (message: string) => void,
    debug: boolean,
    sources?: { title: string; score: number }[]
  ) {
    if (fullAIResponse && abortController.signal.reason !== ABORT_REASON.NEW_CHAT) {
      await this.chainManager.memoryManager
        .getMemory()
        .saveContext({ input: userMessage.message }, { output: fullAIResponse });

      addMessage({
        message: fullAIResponse,
        sender: AI_SENDER,
        isVisible: true,
        timestamp: formatDateTime(new Date()),
        sources: sources,
      });
    }
    updateCurrentAiMessage("");
    if (debug) {
      console.log(
        "==== Chat Memory ====\n",
        (this.chainManager.memoryManager.getMemory().chatHistory as any).messages.map(
          (m: any) => m.content
        )
      );
      console.log("==== Final AI Response ====\n", fullAIResponse);
    }
    return fullAIResponse;
  }

  protected async handleError(
    error: any,
    debug: boolean,
    addMessage?: (message: ChatMessage) => void,
    updateCurrentAiMessage?: (message: string) => void
  ) {
    if (debug) console.error("Error during LLM invocation:", error);
    const errorData = error?.response?.data?.error || error;
    const errorCode = errorData?.code || error;
    let errorMessage = "";

    if (errorCode === "model_not_found") {
      errorMessage =
        "You do not have access to this model or the model does not exist, please check with your API provider.";
    } else {
      errorMessage = `${errorCode}`;
    }

    console.error(errorData);

    if (addMessage && updateCurrentAiMessage) {
      updateCurrentAiMessage("");
      addMessage({
        message: errorMessage,
        sender: AI_SENDER,
        isVisible: true,
        timestamp: formatDateTime(new Date()),
      });
    } else {
      // Fallback to Notice if message handlers aren't provided
      new Notice(errorMessage);
      console.error(errorData);
    }
  }

  protected async handleNonStreamingResponse(
    chain: any, // You might want to use a more specific type here if possible
    userMessage: ChatMessage,
    abortController: AbortController,
    addMessage: (message: ChatMessage) => void,
    updateCurrentAiMessage: (message: string) => void,
    debug: boolean,
    sources?: { title: string; score: number }[]
  ) {
    let fullAIResponse = "";
    try {
      // Load memory variables and format chat history
      const memory = this.chainManager.memoryManager.getMemory();
      const memoryVariables = await memory.loadMemoryVariables({});
      const chatHistory = extractChatHistory(memoryVariables);
      const formattedChatHistory = chatHistory
        .map(([human, ai]) => `Human: ${human}\nAssistant: ${ai}`)
        .join("\n");

      // Construct the full prompt with context
      const prompt = (
        await this.chainManager.promptManager.getQAPrompt({
          question: userMessage.message,
          context: formattedChatHistory,
          systemMessage: "",
        })
      ).toString();

      // Invoke the chain with the constructed prompt
      const response = await chain.invoke({
        input: prompt,
      } as any);

      fullAIResponse = response.content;
      updateCurrentAiMessage(fullAIResponse);
    } catch (error) {
      await this.handleError(error, debug, addMessage, updateCurrentAiMessage);
    }

    return await this.handleResponse(
      fullAIResponse,
      userMessage,
      abortController,
      addMessage,
      updateCurrentAiMessage,
      debug,
      sources
    );
  }
}

class LLMChainRunner extends BaseChainRunner {
  async run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
      isO1Model?: boolean;
    }
  ): Promise<string> {
    const { debug = false, isO1Model = false } = options;

    if (isO1Model) {
      return this.handleNonStreamingResponse(
        ChainManager.getChain(),
        userMessage,
        abortController,
        addMessage,
        updateCurrentAiMessage,
        debug
      );
    }

    let fullAIResponse = "";

    try {
      const chain = ChainManager.getChain();
      const chatStream = await chain.stream({
        input: userMessage.message,
      } as any);

      for await (const chunk of chatStream) {
        if (abortController.signal.aborted) break;
        fullAIResponse += chunk.content;
        updateCurrentAiMessage(fullAIResponse);
      }
    } catch (error) {
      await this.handleError(error, debug, addMessage, updateCurrentAiMessage);
    }

    return this.handleResponse(
      fullAIResponse,
      userMessage,
      abortController,
      addMessage,
      updateCurrentAiMessage,
      debug
    );
  }
}

class VaultQAChainRunner extends BaseChainRunner {
  async run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
      isO1Model?: boolean;
    }
  ): Promise<string> {
    const { debug = false, isO1Model = false } = options;

    if (isO1Model) {
      return this.handleNonStreamingResponse(
        ChainManager.getRetrievalChain(),
        userMessage,
        abortController,
        addMessage,
        updateCurrentAiMessage,
        debug
      );
    }

    let fullAIResponse = "";

    try {
      // Add check for empty index
      const indexEmpty = await this.chainManager.vectorStoreManager.isIndexEmpty();
      if (indexEmpty) {
        return this.handleResponse(
          EMPTY_INDEX_ERROR_MESSAGE,
          userMessage,
          abortController,
          addMessage,
          updateCurrentAiMessage,
          debug
        );
      }

      const memory = this.chainManager.memoryManager.getMemory();
      const memoryVariables = await memory.loadMemoryVariables({});
      const chatHistory = extractChatHistory(memoryVariables);
      const qaStream = await ChainManager.getRetrievalChain().stream({
        question: userMessage.message,
        chat_history: chatHistory,
      } as any);

      for await (const chunk of qaStream) {
        if (abortController.signal.aborted) break;
        fullAIResponse += chunk.content;
        updateCurrentAiMessage(fullAIResponse);
      }

      fullAIResponse = this.addSourcestoResponse(fullAIResponse);
    } catch (error) {
      await this.handleError(error, debug, addMessage, updateCurrentAiMessage);
    }

    return this.handleResponse(
      fullAIResponse,
      userMessage,
      abortController,
      addMessage,
      updateCurrentAiMessage,
      debug
    );
  }

  private addSourcestoResponse(response: string): string {
    const docTitles = extractUniqueTitlesFromDocs(ChainManager.retrievedDocuments);
    if (docTitles.length > 0) {
      const markdownLinks = docTitles
        .map(
          (title) =>
            `- [${title}](obsidian://open?vault=${encodeURIComponent(this.chainManager.app.vault.getName())}&file=${encodeURIComponent(
              title
            )})`
        )
        .join("\n");
      response += "\n\n#### Sources:\n" + markdownLinks;
    }
    return response;
  }
}

class CopilotPlusChainRunner extends BaseChainRunner {
  private isYoutubeOnlyMessage(message: string): boolean {
    const trimmedMessage = message.trim();
    const hasYoutubeCommand = trimmedMessage.includes("@youtube");
    const youtubeUrl = extractYoutubeUrl(trimmedMessage);

    // Check if message contains @youtube command and a valid URL
    return hasYoutubeCommand && youtubeUrl !== null;
  }

  private async streamMultimodalResponse(
    textContent: string,
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    debug: boolean
  ): Promise<string> {
    // Get chat history
    const memory = this.chainManager.memoryManager.getMemory();
    const memoryVariables = await memory.loadMemoryVariables({});
    const chatHistory = extractChatHistory(memoryVariables);

    // Create messages array starting with system message
    const messages: any[] = [];

    // Add system message if available
    let fullSystemMessage = getSystemPrompt();

    // Add chat history context to system message if exists
    if (chatHistory.length > 0) {
      fullSystemMessage +=
        "\n\nThe following is the relevant conversation history. Use this context to maintain consistency in your responses:";
    }

    // Add the combined system message
    if (fullSystemMessage) {
      messages.push({
        role: "system",
        content: `${fullSystemMessage}\nIMPORTANT: Maintain consistency with previous responses in the conversation. If you've provided information about a person or topic before, use that same information in follow-up questions.`,
      });
    }

    // Add chat history
    for (const [human, ai] of chatHistory) {
      messages.push({ role: "user", content: human });
      messages.push({ role: "assistant", content: ai });
    }

    // Create content array for current message
    const content = [
      {
        type: "text",
        text: textContent,
      },
    ];

    // Add image content if present
    if (userMessage.content && userMessage.content.length > 0) {
      const imageContent = userMessage.content.filter(
        (item) => item.type === "image_url" && item.image_url?.url
      );
      content.push(...imageContent);
    }

    // Add current user message
    messages.push({
      role: "user",
      content,
    });

    // Add debug logging for final request
    if (debug) {
      console.log("==== Final Request to AI ====\n", messages);
    }

    let fullAIResponse = "";
    const chatStream = await this.chainManager.chatModelManager.getChatModel().stream(messages);

    for await (const chunk of chatStream) {
      if (abortController.signal.aborted) break;
      fullAIResponse += chunk.content;
      updateCurrentAiMessage(fullAIResponse);
    }

    return fullAIResponse;
  }

  async run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
      updateLoadingMessage?: (message: string) => void;
      isO1Model?: boolean;
    }
  ): Promise<string> {
    const { debug = false, updateLoadingMessage, isO1Model = false } = options;
    let fullAIResponse = "";
    let sources: { title: string; score: number }[] = [];

    if (isO1Model) {
      return this.handleNonStreamingResponse(
        ChainManager.getChain(),
        userMessage,
        abortController,
        addMessage,
        updateCurrentAiMessage,
        debug
      );
    }

    try {
      // Check if this is a YouTube-only message
      if (this.isYoutubeOnlyMessage(userMessage.message)) {
        const url = extractYoutubeUrl(userMessage.message);
        if (url) {
          try {
            const response = await this.chainManager.brevilabsClient.youtube4llm(url);
            if (response.response.transcript) {
              return this.handleResponse(
                response.response.transcript,
                userMessage,
                abortController,
                addMessage,
                updateCurrentAiMessage,
                debug
              );
            }
            return this.handleResponse(
              "Transcript not available. Only English videos with the auto transcript option turned on are supported at the moment.",
              userMessage,
              abortController,
              addMessage,
              updateCurrentAiMessage,
              debug
            );
          } catch (error) {
            return this.handleResponse(
              "An error occurred while transcribing the YouTube video. Right now only English videos with the auto transcript option turned on are supported. Please check the error message in the console for more details.",
              userMessage,
              abortController,
              addMessage,
              updateCurrentAiMessage,
              debug
            );
          }
        }
      }

      if (debug) console.log("==== Step 1: Analyzing intent ====");
      let toolCalls;
      try {
        // Use the original message for intent analysis
        const messageForAnalysis = userMessage.originalMessage || userMessage.message;
        toolCalls = await IntentAnalyzer.analyzeIntent(
          messageForAnalysis,
          this.chainManager.vectorStoreManager,
          this.chainManager.chatModelManager,
          this.chainManager.brevilabsClient
        );
      } catch (error) {
        return this.handleResponse(
          "Copilot Plus message failed. Please provide a valid license key in your Copilot setting.",
          userMessage,
          abortController,
          addMessage,
          updateCurrentAiMessage,
          debug
        );
      }

      // Use the same removeAtCommands logic as IntentAnalyzer
      const cleanedUserMessage = userMessage.message
        .split(" ")
        .filter((word) => !COPILOT_TOOL_NAMES.includes(word.toLowerCase()))
        .join(" ")
        .trim();

      const toolOutputs = await this.executeToolCalls(toolCalls, debug, updateLoadingMessage);
      const localSearchResult = toolOutputs.find(
        (output) => output.tool === "localSearch" && output.output && output.output.length > 0
      );

      if (localSearchResult) {
        if (debug) console.log("==== Step 2: Processing local search results ====");
        const documents = JSON.parse(localSearchResult.output);

        // Format chat history from memory
        const memory = this.chainManager.memoryManager.getMemory();
        const memoryVariables = await memory.loadMemoryVariables({});
        const chatHistory = extractChatHistory(memoryVariables);

        if (debug) console.log("==== Step 3: Condensing Question ====");
        const standaloneQuestion = await this.getStandaloneQuestion(
          cleanedUserMessage,
          chatHistory
        );
        if (debug) console.log("Condensed standalone question: ", standaloneQuestion);

        if (debug) console.log("==== Step 4: Preparing context ====");
        const timeExpression = this.getTimeExpression(toolCalls);
        const context = this.formatLocalSearchResult(documents, timeExpression);

        const currentTimeOutputs = toolOutputs.filter((output) => output.tool === "getCurrentTime");
        const enhancedQuestion = this.prepareEnhancedUserMessage(
          standaloneQuestion,
          currentTimeOutputs
        );

        if (debug) console.log(context);
        if (debug) console.log("==== Step 5: Invoking QA Chain ====");
        const qaPrompt = await this.chainManager.promptManager.getQAPrompt({
          question: enhancedQuestion,
          context: context,
          systemMessage: "", // System prompt is added separately in streamMultimodalResponse
        });

        fullAIResponse = await this.streamMultimodalResponse(
          qaPrompt,
          userMessage,
          abortController,
          updateCurrentAiMessage,
          debug
        );

        // Append sources to the response
        sources = this.getSources(documents);
      } else {
        const enhancedUserMessage = this.prepareEnhancedUserMessage(
          cleanedUserMessage,
          toolOutputs
        );
        // If no results, default to LLM Chain
        if (debug) {
          console.log("No local search results. Using standard LLM Chain.");
          console.log("Enhanced user message:", enhancedUserMessage);
        }

        fullAIResponse = await this.streamMultimodalResponse(
          enhancedUserMessage,
          userMessage,
          abortController,
          updateCurrentAiMessage,
          debug
        );
      }
    } catch (error) {
      // Reset loading message to default
      updateLoadingMessage?.(LOADING_MESSAGES.DEFAULT);
      await this.handleError(error, debug, addMessage, updateCurrentAiMessage);
    }

    return this.handleResponse(
      fullAIResponse,
      userMessage,
      abortController,
      addMessage,
      updateCurrentAiMessage,
      debug,
      sources
    );
  }

  private async getStandaloneQuestion(
    question: string,
    chatHistory: [string, string][]
  ): Promise<string> {
    const condenseQuestionTemplate = `Given the following conversation and a follow up question,
    summarize the conversation as context and keep the follow up question unchanged, in its original language.
    If the follow up question is unrelated to its preceding messages, return this follow up question directly.
    If it is related, then combine the summary and the follow up question to construct a standalone question.
    Make sure to keep any [[]] wrapped note titles in the question unchanged.
    If there's nothing in the chat history, just return the follow up question.

    Chat History:
    {chat_history}
    Follow Up Input: {question}
    Standalone question:`;

    const formattedChatHistory = chatHistory
      .map(([human, ai]) => `Human: ${human}\nAssistant: ${ai}`)
      .join("\n");

    const response = await this.chainManager.chatModelManager.getChatModel().invoke([
      { role: "system", content: condenseQuestionTemplate },
      {
        role: "user",
        content: condenseQuestionTemplate
          .replace("{chat_history}", formattedChatHistory)
          .replace("{question}", question),
      },
    ]);

    return response.content as string;
  }

  private getSources(documents: any): { title: string; score: number }[] {
    if (!documents || !Array.isArray(documents)) {
      console.warn("No valid documents provided to getSources");
      return [];
    }
    return this.sortUniqueDocsByScore(documents);
  }

  private sortUniqueDocsByScore(documents: any[]): any[] {
    const uniqueDocs = new Map<string, any>();

    // Iterate through all documents
    for (const doc of documents) {
      if (!doc.title || (!doc?.score && !doc?.rerank_score)) {
        console.warn("Invalid document structure:", doc);
        continue;
      }

      const currentDoc = uniqueDocs.get(doc.title);
      const isReranked = doc && "rerank_score" in doc;
      const docScore = isReranked ? doc.rerank_score : doc.score;

      // If the title doesn't exist in the map, or if the new doc has a higher score, update the map
      if (!currentDoc || docScore > (currentDoc.score ?? 0)) {
        uniqueDocs.set(doc.title, {
          title: doc.title,
          score: docScore,
          isReranked: isReranked,
        });
      }
    }

    // Convert the map values back to an array and sort by score in descending order
    return Array.from(uniqueDocs.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  private async executeToolCalls(
    toolCalls: any[],
    debug: boolean,
    updateLoadingMessage?: (message: string) => void
  ) {
    const toolOutputs = [];
    for (const toolCall of toolCalls) {
      if (debug) {
        console.log(`==== Step 2: Calling tool: ${toolCall.tool.name} ====`);
      }
      if (toolCall.tool.name === "localSearch") {
        updateLoadingMessage?.(LOADING_MESSAGES.READING_FILES);
      } else if (toolCall.tool.name === "webSearch") {
        updateLoadingMessage?.(LOADING_MESSAGES.SEARCHING_WEB);
      }
      const output = await ToolManager.callTool(toolCall.tool, toolCall.args);
      toolOutputs.push({ tool: toolCall.tool.name, output });
    }
    return toolOutputs;
  }

  private prepareEnhancedUserMessage(userMessage: string, toolOutputs: any[]) {
    let context = "";
    if (toolOutputs.length > 0) {
      const validOutputs = toolOutputs.filter((output) => output.output != null);
      if (validOutputs.length > 0) {
        context =
          "\n\n# Additional context:\n\n" +
          validOutputs
            .map((output) => `# ${output.tool}\n${JSON.stringify(output.output)}`)
            .join("\n\n");
      }
    }
    return `User message: ${userMessage}${context}`;
  }

  private getTimeExpression(toolCalls: any[]): string {
    const timeRangeCall = toolCalls.find((call) => call.tool.name === "getTimeRangeMs");
    return timeRangeCall ? timeRangeCall.args.timeExpression : "";
  }

  private formatLocalSearchResult(documents: any[], timeExpression: string): string {
    const formattedDocs = documents
      .filter((doc) => doc.includeInContext)
      .map((doc: any) => `Note in Vault: ${doc.content}`)
      .join("\n\n");
    return timeExpression
      ? `Local Search Result for ${timeExpression}:\n${formattedDocs}`
      : `Local Search Result:\n${formattedDocs}`;
  }
}

export { CopilotPlusChainRunner, LLMChainRunner, VaultQAChainRunner };
