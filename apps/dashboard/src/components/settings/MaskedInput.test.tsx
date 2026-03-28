import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MaskedInput } from "./MaskedInput";

describe("MaskedInput", () => {
  it("renders as password input by default", () => {
    render(<MaskedInput value="secret" onChange={vi.fn()} />);
    const input = screen.getByDisplayValue("secret");
    expect(input).toHaveAttribute("type", "password");
  });

  it("shows value as text when eye button is clicked", () => {
    render(<MaskedInput value="secret" onChange={vi.fn()} />);
    const toggle = screen.getByRole("button");
    fireEvent.click(toggle);
    expect(screen.getByDisplayValue("secret")).toHaveAttribute("type", "text");
  });

  it("hides value again on second click", () => {
    render(<MaskedInput value="secret" onChange={vi.fn()} />);
    const toggle = screen.getByRole("button");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByDisplayValue("secret")).toHaveAttribute("type", "password");
  });

  it("calls onChange when input value changes", () => {
    const onChange = vi.fn();
    const { container } = render(<MaskedInput value="" onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "newval" } });
    expect(onChange).toHaveBeenCalledWith("newval");
  });

  it("renders placeholder", () => {
    render(<MaskedInput value="" onChange={vi.fn()} placeholder="sk-ant-..." />);
    expect(screen.getByPlaceholderText("sk-ant-...")).toBeInTheDocument();
  });

  it("disables input and toggle when disabled prop is true", () => {
    render(<MaskedInput value="x" onChange={vi.fn()} disabled />);
    const input = screen.getByDisplayValue("x");
    expect(input).toBeDisabled();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
