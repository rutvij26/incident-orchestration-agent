import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";

describe("Card components", () => {
  it("renders Card with all sub-components", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>My Title</CardTitle>
          <CardDescription>Description text</CardDescription>
        </CardHeader>
        <CardContent>Content body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("Description text")).toBeInTheDocument();
    expect(screen.getByText("Content body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("accepts custom className on Card", () => {
    render(<Card className="custom-card"><div /></Card>);
    expect(document.querySelector(".custom-card")).toBeInTheDocument();
  });
});
