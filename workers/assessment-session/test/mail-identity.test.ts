import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMailFooter, mailFooterLine, mailLogoUrl, publicAllowedFrom, resolveFrom, safeLogoPath, uniqueEmails } from "../src/mail/identity.js";
import { renderEmail, renderText, setMailIdentity, MAIL_LOGO, SITE_NAME } from "../src/mail/template";

test("empty logo paths fall back to /logo.svg on the live site (today's behaviour)", () => {
  assert.equal(mailLogoUrl("https://www.shaiqmuhammad.com", "", ""), "https://www.shaiqmuhammad.com/logo.svg");
  assert.equal(safeLogoPath("https://evil.example/x.png"), "");
  assert.equal(safeLogoPath("/brand/email-logo.png"), "/brand/email-logo.png");
  assert.equal(mailLogoUrl("https://almudarris.com/", "/brand/email-logo.png", "/logo.svg"), "https://almudarris.com/brand/email-logo.png");
  assert.equal(mailLogoUrl("https://almudarris.com", "", "/brand/logo.png"), "https://almudarris.com/brand/logo.png");
});

test("footer falls back to the original wording", () => {
  assert.equal(mailFooterLine("", "contact@shaiqmuhammad.com", "https://www.shaiqmuhammad.com"), defaultMailFooter("contact@shaiqmuhammad.com", "https://www.shaiqmuhammad.com"));
  assert.match(defaultMailFooter("contact@shaiqmuhammad.com", "https://www.shaiqmuhammad.com"), /Questions\? Write to contact@shaiqmuhammad.com/);
  assert.equal(mailFooterLine("Write to us any time", "c@x.com", "https://www.shaiqmuhammad.com"), "Write to us any time");
});

test("From address falls back when it is not allowed", () => {
  const allowed = publicAllowedFrom({ mailContact: "contact@shaiqmuhammad.com", mailInfo: "info@shaiqmuhammad.com" });
  assert.deepEqual(allowed, ["contact@shaiqmuhammad.com", "info@shaiqmuhammad.com"]);
  const ok = resolveFrom("info@shaiqmuhammad.com", allowed, "user@icloud.com");
  assert.equal(ok.from, "info@shaiqmuhammad.com");
  assert.equal(ok.fellBack, false);
  const bad = resolveFrom("random@elsewhere.com", allowed, "user@icloud.com");
  assert.equal(bad.from, "user@icloud.com");
  assert.equal(bad.fellBack, true);
  const noAuth = resolveFrom("random@elsewhere.com", allowed, "");
  assert.equal(noAuth.from, "contact@shaiqmuhammad.com");
  assert.equal(noAuth.fellBack, true);
});

test("uniqueEmails ignores junk", () => {
  assert.deepEqual(uniqueEmails([" Contact@ShaiqMuhammad.com ", "not-an-email", "contact@shaiqmuhammad.com"]), ["contact@shaiqmuhammad.com"]);
});

test("renderEmail uses branding and does not send mail", () => {
  setMailIdentity({
    siteUrl: "https://school.example",
    contact: "hello@school.example",
    info: "mail@school.example",
    fromName: "School",
    siteName: "Example School",
    header: "#155e63",
    sun: "#f2c14e",
    logoPath: "/brand/email-logo.png",
    footer: "Write to hello@school.example",
  });
  assert.equal(MAIL_LOGO, "https://school.example/brand/email-logo.png");
  assert.equal(SITE_NAME, "Example School");
  const html = renderEmail({ heading: "Hello", paragraphs: ["Peace."], button: { label: "Open", url: "https://school.example/lms" } });
  assert.match(html, /https:\/\/school\.example\/brand\/email-logo\.png/);
  assert.match(html, /#155e63/);
  assert.match(html, /#f2c14e/);
  assert.match(html, /Example School/);
  assert.match(html, /Write to/);
  assert.doesNotMatch(html, /<script/i);
  const text = renderText({ heading: "Hello", paragraphs: ["Peace."] });
  assert.match(text, /Example School/);
  // restore school defaults so later tests (if any) stay safe
  setMailIdentity({
    siteUrl: "https://www.shaiqmuhammad.com",
    contact: "contact@shaiqmuhammad.com",
    info: "info@shaiqmuhammad.com",
    fromName: "Shaiq Muhammad",
    siteName: "Shaiq Muhammad",
    header: "",
    sun: "",
    logoPath: "",
    siteLogoPath: "",
    footer: "",
  });
  const original = renderEmail({ heading: "Test", paragraphs: ["Hi"] });
  assert.match(original, /https:\/\/www\.shaiqmuhammad\.com\/logo\.svg/);
  assert.match(original, /#1b3a57/);
  assert.match(original, /#f5c542/);
});
