import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./table";

describe("Table components", () => {
  it("renders a full table with all sub-components", () => {
    const { container } = render(
      <Table>
        <TableCaption>My caption</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(container.querySelector("caption")).toBeInTheDocument();
    expect(container.querySelector("tfoot")).toBeInTheDocument();
  });

  it("TableCaption accepts custom className", () => {
    const { container } = render(
      <Table>
        <TableCaption className="my-cap">Caption</TableCaption>
      </Table>
    );
    expect(container.querySelector("caption")?.className).toContain("my-cap");
  });

  it("TableFooter accepts custom className", () => {
    const { container } = render(
      <Table>
        <TableFooter className="my-footer" />
      </Table>
    );
    expect(container.querySelector("tfoot")?.className).toContain("my-footer");
  });
});
