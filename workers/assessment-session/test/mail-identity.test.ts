import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUILTIN_ALLOWED_FROM, defaultMailFooter, mailFooterLine, mailLogoUrl, MAIL_SENDER_DEFAULTS, normAllowedList,
  publicAllowedFrom, resolveFrom, safeLogoPath, senderForType, uniqueEmails,
} from "../src/mail/identity.js";
import { renderEmail, renderText, setMailIdentity, MAIL_LOGO, SITE_NAME } from "../src/mail/template";

test("emails use the site logo PNG, with an optional email override", () => {
  assert.equal(mailLogoUrl("https://www.shaiqmuhammad.com", "", ""), "https://www.shaiqmuhammad.com/logo-email.png");
  assert.equal(mailLogoUrl("https://www.shaiqmuhammad.com", "", "/logo.svg"), "https://www.shaiqmuhammad.com/logo-email.png");
  assert.equal(mailLogoUrl("https://www.shaiqmuhammad.com", "", "/logo.svg", "/brand/logo-email.png"), "https://www.shaiqmuhammad.com/brand/logo-email.png");
  assert.equal(safeLogoPath("https://evil.example/x.png"), "");
  assert.equal(safeLogoPath("/brand/email-logo.png"), "/brand/email-logo.png");
  assert.equal(safeLogoPath("/logo-email.png"), "/logo-email.png");
  assert.equal(mailLogoUrl("https://almudarris.com/", "/brand/email-logo.png", "/logo.svg"), "https://almudarris.com/brand/email-logo.png");
  assert.equal(mailLogoUrl("https://almudarris.com", "", "/brand/logo.png"), "https://almudarris.com/brand/logo.png");
  assert.equal(mailLogoUrl("https://almudarris.com", "/brand/custom.png", "/brand/logo.png"), "https://almudarris.com/brand/custom.png");
});

test("footer falls back to the original wording", () => {
  assert.equal(mailFooterLine("", "contact@shaiqmuhammad.com", "https://www.shaiqmuhammad.com"), defaultMailFooter("contact@shaiqmuhammad.com", "https://www.shaiqmuhammad.com"));
  assert.match(defaultMailFooter("contact@shaiqmuhammad.com", "https://www.shaiqmuhammad.com"), /Questions\? Write to contact@shaiqmuhammad.com/);
  assert.equal(mailFooterLine("Write to us any time", "c@x.com", "https://www.shaiqmuhammad.com"), "Write to us any time");
});

test("built-in From addresses and saved extras are allowed, with fallback", () => {
  const allowed = publicAllowedFrom({ mailContact: "contact@shaiqmuhammad.com", mailInfo: "info@shaiqmuhammad.com" });
  for (const a of BUILTIN_ALLOWED_FROM) assert.ok(allowed.includes(a), a);
  const ok = resolveFrom("support@almudarris.com", allowed, "shaiqmuhammad@icloud.com");
  assert.equal(ok.from, "support@almudarris.com");
  assert.equal(ok.fellBack, false);
  const also = resolveFrom("info@shaiqmuhammad.com", allowed, "shaiqmuhammad@icloud.com");
  assert.equal(also.from, "info@shaiqmuhammad.com");
  const bad = resolveFrom("random@elsewhere.com", allowed, "shaiqmuhammad@icloud.com");
  assert.equal(bad.from, "shaiqmuhammad@icloud.com");
  assert.equal(bad.fellBack, true);
  const noAuth = resolveFrom("random@elsewhere.com", allowed, "");
  assert.equal(noAuth.from, allowed[0]);
  assert.equal(noAuth.fellBack, true);
  const withSaved = publicAllowedFrom({ saved: ["extra@icloud.com"], extra: "also@icloud.com, not-an-email" });
  assert.ok(withSaved.includes("extra@icloud.com"));
  assert.ok(withSaved.includes("also@icloud.com"));
  assert.ok(!withSaved.includes("not-an-email"));
});

test("senderForType uses defaults until a type is configured", () => {
  assert.equal(senderForType("notify", {}, "info@shaiqmuhammad.com"), MAIL_SENDER_DEFAULTS.notify);
  assert.equal(senderForType("account", {}, "info@shaiqmuhammad.com"), MAIL_SENDER_DEFAULTS.account);
  assert.equal(senderForType("billing", { billing: "info@shaiqmuhammad.com" }, "x@y.com"), "info@shaiqmuhammad.com");
  assert.equal(senderForType("reports", {}, ""), MAIL_SENDER_DEFAULTS.reports);
  assert.equal(senderForType("contact", {}, ""), MAIL_SENDER_DEFAULTS.contact);
});

test("normAllowedList validates and caps extras", () => {
  assert.deepEqual(normAllowedList([" Extra@iCloud.com ", "nope", "extra@icloud.com"]), ["extra@icloud.com"]);
  assert.equal(normAllowedList(Array.from({ length: 30 }, (_, i) => `a${i}@icloud.com`)).length, 20);
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
    siteLogoPngPath: "",
    footer: "",
    senders: {},
    allowedFrom: [],
  });
  const original = renderEmail({ heading: "Test", paragraphs: ["Hi"] });
  assert.match(original, /https:\/\/www\.shaiqmuhammad\.com\/logo-email\.png/);
  assert.match(original, /#1b3a57/);
  assert.match(original, /#f5c542/);
});
