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

describe("DB block roundtrip", () => {
  it("should roundtrip db fenced block", () => {
    const content = '{"connectionId":"abc-123","query":"SELECT * FROM users","timeoutMs":5000}';
    const md = `\`\`\`db\n${content}\n\`\`\``;

    const html = markdownToHtml(md);
    expect(html).toContain('data-type="db-block"');

    const mdBack = htmlToMarkdown(html);
    expect(mdBack).toContain("```db");
    expect(mdBack).toContain(content);
  });

  it("should preserve alias and displayMode on db block", () => {
    const md = '```db alias=query1 displayMode=split\n{"connectionId":"x","query":"SELECT 1"}\n```';

    const html = markdownToHtml(md);
    expect(html).toContain('data-alias="query1"');
    expect(html).toContain('data-display-mode="split"');

    const mdBack = htmlToMarkdown(html);
    expect(mdBack).toContain("alias=query1");
    expect(mdBack).toContain("displayMode=split");
    expect(mdBack).toContain("```db");
  });
});

describe("E2E block roundtrip", () => {
  it("should roundtrip e2e fenced block", () => {
    const content = '{"baseUrl":"https://api.test.com","defaultHeaders":[],"steps":[{"name":"Login","method":"POST","url":"/auth","headers":[],"body":"{}","params":[],"expect":{"status":200},"extract":{}}]}';
    const md = `\`\`\`e2e\n${content}\n\`\`\``;

    const html = markdownToHtml(md);
    expect(html).toContain('data-type="e2e-block"');

    const mdBack = htmlToMarkdown(html);
    expect(mdBack).toContain("```e2e");
    expect(mdBack).toContain(content);
  });

  it("should preserve alias and displayMode on e2e block", () => {
    const md = '```e2e alias=flow1 displayMode=output\n{"baseUrl":"https://api.test.com","defaultHeaders":[],"steps":[]}\n```';

    const html = markdownToHtml(md);
    expect(html).toContain('data-alias="flow1"');
    expect(html).toContain('data-display-mode="output"');

    const mdBack = htmlToMarkdown(html);
    expect(mdBack).toContain("alias=flow1");
    expect(mdBack).toContain("displayMode=output");
    expect(mdBack).toContain("```e2e");
  });
});

describe("GFM table roundtrip", () => {
  it("should roundtrip a simple pipe table", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";

    const html = markdownToHtml(md);
    expect(html).toContain("<table");
    expect(html).toContain("Alice");

    const mdBack = htmlToMarkdown(html);
    expect(mdBack).toContain("Alice");
    expect(mdBack).toContain("Bob");
    expect(mdBack).toContain("|");
  });

  it("should preserve table content through roundtrip", () => {
    const md = "# Data\n\n| Key | Value |\n| --- | --- |\n| host | localhost |\n| port | 5432 |\n\nAfter table.";

    const html = markdownToHtml(md);
    const mdBack = htmlToMarkdown(html);

    expect(mdBack).toContain("# Data");
    expect(mdBack).toContain("host");
    expect(mdBack).toContain("localhost");
    expect(mdBack).toContain("After table");
  });
});
