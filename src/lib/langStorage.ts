/** Shared language preference for the public site and /admin (same origin). */
export const LANG_STORAGE_KEY = "sm-lang";

/** Inline script: apply saved Arabic/RTL before paint (avoids LTR flash). */
export const langInitScript = `try{var l=localStorage.getItem("${LANG_STORAGE_KEY}");if(l==="ar"){var d=document.documentElement;d.lang="ar";d.dir="rtl";}}catch(e){}`;
