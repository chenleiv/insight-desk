import React from "react";
import type { DocumentInput } from "../../../api/documentsClient";

type Props = {
  form: DocumentInput;
  onChange: (form: DocumentInput) => void;
};

export const DocumentEdit: React.FC<Props> = ({ form, onChange }) => {
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    onChange({ ...form, [e.target.name]: e.target.value });
  };

  return (
    <div className="doc-pane-body">
      <label className="doc-pane-label">
        Title*
        <input
          name="title"
          value={form.title}
          onChange={handleChange}
          placeholder="Enter document title"
          autoFocus
        />
      </label>

      <label className="doc-pane-label">
        Category*
        <input
          name="category"
          value={form.category}
          onChange={handleChange}
          placeholder="Enter category"
        />
      </label>

      <label className="doc-pane-label">
        Summary*
        <textarea
          name="summary"
          rows={4}
          value={form.summary}
          onChange={handleChange}
          placeholder="Brief summary of the document"
        />
      </label>

      <label className="doc-pane-label">
        Content*
        <textarea
          name="content"
          rows={16}
          value={form.content}
          onChange={handleChange}
          placeholder="Full document content"
        />
      </label>
    </div>
  );
};
