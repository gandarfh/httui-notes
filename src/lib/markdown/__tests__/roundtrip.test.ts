import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "../serializer";
import { markdownToHtml } from "../parser";

describe("HTTP block roundtrip", () => {
  it("mermaid div roundtrips", () => {
    const html = `<div data-type="mermaid" data-content="graph TD\n  A --> B"></div>`;
    const md = htmlToMarkdown(html);
    console.log("Mermaid MD:", JSON.stringify(md));
    expect(md).toContain("```mermaid");
  });

  it("should roundtrip a bare div with data-type http-block", () => {
    const html = `<div data-type="http-block" data-alias="test" data-display-mode="split" data-content='{"method":"GET","url":"https://example.com","params":[],"headers":[],"body":""}'></div>`;

    const md = htmlToMarkdown(html);
    console.log("MD:", JSON.stringify(md));

    expect(md).toContain("```http");
    expect(md).toContain("```");

    const htmlBack = markdownToHtml(md);
    console.log("HTML:", htmlBack);

    expect(htmlBack).toContain('data-type="http-block"');
    expect(htmlBack).toContain("data-content");
  });

  it("should roundtrip markdown with http fenced block", () => {
    const md = '# Test\n\n```http\n{"method":"GET","url":"https://example.com","params":[],"headers":[],"body":""}\n```\n\nSome text after.';

    const html = markdownToHtml(md);
    expect(html).toContain('data-type="http-block"');

    const mdBack = htmlToMarkdown(html);
    expect(mdBack).toContain("```http");
    expect(mdBack).toContain("# Test");
    expect(mdBack).toContain("Some text after");
  });

  it("should preserve alias and displayMode through roundtrip", () => {
    const md = '```http alias=login displayMode=split\n{"method":"POST","url":"https://api.test.com","params":[],"headers":[],"body":""}\n```';

    const html = markdownToHtml(md);
    expect(html).toContain('data-alias="login"');
    expect(html).toContain('data-display-mode="split"');

    const mdBack = htmlToMarkdown(html);
    expect(mdBack).toContain("alias=login");
    expect(mdBack).toContain("displayMode=split");
    expect(mdBack).toContain("```http");
  });

  it("should preserve JSON content through roundtrip", () => {
    const content = '{"method":"POST","url":"https://api.test.com/data","params":[{"key":"page","value":"1"}],"headers":[{"key":"Authorization","value":"Bearer token"}],"body":"{\\"name\\":\\"test\\"}"}';
    const md = `\`\`\`http\n${content}\n\`\`\``;

    const html = markdownToHtml(md);
    const mdBack = htmlToMarkdown(html);

    expect(mdBack.trim()).toContain("```http");
    expect(mdBack).toContain(content);
  });
});
