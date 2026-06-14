import type { DocumentItem, DocumentInput } from "../../../api/documentsClient";

const DOCUMENT_FIELDS = [
  "title",
  "category",
  "content",
] as const;

const normalize = (val: string | null | undefined) => (val || "").trim();

export const toInput = (d: DocumentItem): DocumentInput =>
  DOCUMENT_FIELDS.reduce((acc, field) => {
    acc[field] = d[field] ?? "";
    return acc;
  }, {} as DocumentInput);

export const emptyInput = (): DocumentInput =>
  DOCUMENT_FIELDS.reduce((acc, field) => {
    acc[field] = "";
    return acc;
  }, {} as DocumentInput);

export const isSameInput = (a: DocumentInput, b: DocumentInput): boolean =>
  DOCUMENT_FIELDS.every((key) => normalize(a[key]) === normalize(b[key]));

export const isInputValid = (i: DocumentInput): boolean =>
  DOCUMENT_FIELDS.every((key) => !!normalize(i[key]));
