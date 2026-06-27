import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the downloader form as the first screen", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "影片下載器" })).toBeInTheDocument();
    expect(screen.getByLabelText("影片 URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "分析" })).toBeInTheDocument();
  });
});
