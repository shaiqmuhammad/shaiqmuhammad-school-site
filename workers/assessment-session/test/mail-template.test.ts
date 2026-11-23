import assert from "node:assert/strict";
import { test } from "node:test";
import { brandSignature, enquiryMail, renderEmail, renderPersonalEmail, renderText, setMailIdentity, sigHtml, DEFAULT_SIG } from "../src/mail/template";

setMailIdentity({ siteUrl: "https://www.shaiqmuhammad.com", contact: "contact@shaiqmuhammad.com", siteName: "Shaiq Muhammad" });

test("every branded email ends with the school signature (name, contact@, website) and a plain-text twin", () => {
  const e = { heading: "Hello", paragraphs: ["Assalamu alaikum,", "Body <b>text</b>"], button: { label: "Open", url: "https://www.shaiqmuhammad.com/lms" } };
  const html = renderEmail(e);
  assert.match(html, /<title>Hello<\/title>/);
  assert.match(html, /mailto:contact@shaiqmuhammad\.com/);
  assert.match(html, /href="https:\/\/www\.shaiqmuhammad\.com"[^>]*>shaiqmuhammad\.com</);
  assert.ok(html.includes(brandSignature()));
  assert.match(html, /Shaiq Muhammad/);
  assert.ok(!html.includes("<b>text</b>"), "body text is escaped");
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /name="color-scheme" content="light dark"/);
  const text = renderText(e);
  assert.match(text, /--\nShaiq Muhammad\ncontact@shaiqmuhammad\.com\nhttps:\/\/www\.shaiqmuhammad\.com/);
  assert.match(text, /Open: https:\/\/www\.shaiqmuhammad\.com\/lms/);
});

test("signature can be left out and facts render as rows", () => {
  const html = renderEmail({ heading: "H", paragraphs: ["p"], facts: [{ label: "From", value: "A & B" }], signature: false });
  assert.ok(!html.includes(brandSignature()));
  assert.match(html, /From<\/td><td[^>]*>A &amp; B</);
  assert.ok(!renderText({ heading: "H", paragraphs: ["p"], signature: false }).includes("--\n"));
});

test("RTL email keeps direction and alignment", () => {
  const html = renderEmail({ heading: "مرحبا", paragraphs: ["نص"], rtl: true });
  assert.match(html, /<html dir="rtl"/);
  assert.match(html, /text-align:right/);
});

test("enquiry notification shows sender facts, a reply button and no signature", () => {
  const m = enquiryMail({ name: "Sara Ali", email: "sara@example.com", subject: "Classes", message: "Hello there" });
  assert.deepEqual(m.facts, [{ label: "From", value: "Sara Ali" }, { label: "Email", value: "sara@example.com" }]);
  assert.match(m.button!.url, /^mailto:sara@example\.com\?subject=Re%3A%20Classes$/);
  assert.equal(m.signature, false);
  assert.match(renderText(m), /From: Sara Ali\nEmail: sara@example\.com/);
});

test("personal mail is wrapped in the brand frame, escapes the text and keeps the chosen signature only", () => {
  const withSig = renderPersonalEmail({ subject: "Re: Classes", text: "Dear <Sara>\nThanks", sigHtml: sigHtml({ ...DEFAULT_SIG, name: "Teacher One" }) });
  assert.match(withSig, /Dear &lt;Sara&gt;/);
  assert.match(withSig, /Teacher One/);
  assert.match(withSig, /white-space:pre-wrap/);
  assert.match(withSig, /prefers-color-scheme:dark/);
  const noSig = renderPersonalEmail({ subject: "Hi", text: "plain" });
  assert.ok(!noSig.includes(brandSignature()));
  assert.ok(!/<script/i.test(withSig + noSig));
});

test("footer links the contact address and the site once each, without breaking the markup", () => {
  const html = renderEmail({ heading: "H", paragraphs: ["p"] });
  const footer = html.slice(html.lastIndexOf("em-rule em-muted"));
  assert.equal((footer.match(/<a /g) || []).length, 2);
  assert.equal(footer.replace(/<[^>]+>/g, "").match(/Questions\? Write to contact@shaiqmuhammad\.com · shaiqmuhammad\.com/)?.length, 1);
  assert.ok(!/>"?\s*style=/.test(footer.replace(/<a [^>]*>/g, "")));
});
