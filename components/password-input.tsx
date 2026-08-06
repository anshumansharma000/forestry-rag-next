"use client";

import { Eye, EyeOff } from "lucide-react";
import { InputHTMLAttributes, useState } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-2">
      <input
        {...props}
        className={`${className} pr-12`}
        type={visible ? "text" : "password"}
      />
      <button
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded text-[#626b79] transition hover:bg-surface-container-low hover:text-primary"
        onClick={() => setVisible((current) => !current)}
        title={visible ? "Hide password" : "Show password"}
        type="button"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Eye aria-hidden="true" className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
