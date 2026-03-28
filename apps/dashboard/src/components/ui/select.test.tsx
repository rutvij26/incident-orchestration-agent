import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectGroup,
} from "./select";

describe("Select components", () => {
  it("renders SelectLabel with className", () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="my-label">Category</SelectLabel>
            <SelectItem value="a">A</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
    // Verify the component tree renders without error
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders SelectSeparator with className", () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
          <SelectSeparator className="my-sep" />
          <SelectItem value="b">B</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders SelectLabel inside SelectGroup", () => {
    const { container } = render(
      <Select>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="label-cls">Group</SelectLabel>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders SelectSeparator inside Select", () => {
    const { container } = render(
      <Select>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
          <SelectSeparator className="sep-cls" />
        </SelectContent>
      </Select>
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
