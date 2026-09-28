import { load } from "cheerio";

const previewURL = (value: string, id: string) =>
  value.startsWith("/") && !value.startsWith("//")
    ? `/preview/${id}${value}`
    : value;

/** Follow srcset URL/descriptor boundaries; commas inside data URLs are not separators. */
export function rewritePreviewSrcset(value: string, id: string) {
  let cursor = 0;
  let result = "";
  const whitespace = /[\t\n\f\r ]/;
  while (cursor < value.length) {
    const start = cursor;
    while (
      cursor < value.length &&
      (whitespace.test(value[cursor]) || value[cursor] === ",")
    )
      cursor++;
    result += value.slice(start, cursor);
    const urlStart = cursor;
    while (cursor < value.length && !whitespace.test(value[cursor])) cursor++;
    const token = value.slice(urlStart, cursor);
    const url = token.replace(/,+$/, "");
    result += previewURL(url, id) + token.slice(url.length);
    if (url.length !== token.length) continue;
    const descriptorStart = cursor;
    let parentheses = 0;
    while (cursor < value.length) {
      const char = value[cursor++];
      if (char === "(") parentheses++;
      if (char === ")") parentheses--;
      if (char === "," && parentheses <= 0) break;
    }
    result += value.slice(descriptorStart, cursor);
  }
  return result;
}

export function rewritePreviewHTML(html: string, id: string) {
  const $ = load(html);
  for (const element of $("[href],[src],[srcset],[imagesrcset]")) {
    for (const attribute of ["href", "src"]) {
      const value = $(element).attr(attribute);
      if (value) $(element).attr(attribute, previewURL(value, id));
    }
    for (const attribute of ["srcset", "imagesrcset"]) {
      const value = $(element).attr(attribute);
      if (value) $(element).attr(attribute, rewritePreviewSrcset(value, id));
    }
  }
  $('form button[type="submit"]').attr("disabled", "disabled");
  return $.html();
}
