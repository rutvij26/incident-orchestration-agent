"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

interface MaskedInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MaskedInput({
  value,
  onChange,
  placeholder,
  disabled,
}: MaskedInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-10 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1 h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100"
        onClick={() => setShow((s) => !s)}
        disabled={disabled}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
