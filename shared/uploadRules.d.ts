export const MAX_UPLOAD_BYTES: number;
export const FILE_TOO_LARGE_MESSAGE: string;
export const UPLOAD_TYPES: Readonly<Record<string, readonly string[]>>;
export const UPLOAD_ACCEPT: string;
export function fileExtension(fileName: string | null | undefined): string;
export function resolveUploadMime(fileName: string | null | undefined, mimeType: string | null | undefined): string | null;
export function fileTypeNotAllowedMessage(mimeType: string): string;
export function uploadError(file: { name: string; type: string; size: number }): string | null;
