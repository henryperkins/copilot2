import React, { useState, useEffect } from "react";
import { TextComponent } from "./SettingBlocks";
import { debounce } from "@/utils/debounce";

interface ApiSettingProps {
  title: string;
  description?: string;
  value: string;
  setValue: (value: string) => void;
  placeholder?: string;
  type?: string;
}

const ApiSetting: React.FC<ApiSettingProps> = ({
  title,
  description,
  value,
  setValue,
  placeholder,
  type = "password",
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [isValid, setIsValid] = useState(true);

  const debouncedValidate = debounce((value: string) => {
    // Implement your validation logic here
    const isValid = validateApiKey(value); // Replace with your actual validation function
    setIsValid(isValid);
    if (isValid) {
      setValue(value);
    } else {
      console.warn("Invalid API key:", value);
    }
  }, 300); // 300ms delay

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    debouncedValidate(newValue);
  };

  const handleBlur = () => {
    debouncedValidate(inputValue); // Validate immediately when the input loses focus
  };

  useEffect(() => {
    setInputValue(value);
    debouncedValidate(value); // Validate on initial render
  }, [value]);

  return (
    <div>
      <TextComponent
        name={title}
        description={description}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={placeholder || ""}
        type={type}
        className={!isValid ? "error" : ""}
      />
      {!isValid && <div className="error-message">Invalid API key</div>}
    </div>
  );
};

// Example validation function, replace with your actual logic
const validateApiKey = (apiKey: string): boolean => {
  // Implement your validation logic here
  return apiKey.length > 0; // Simple example: API key should not be empty
};

export default ApiSetting;
