import { useRef, useState, useCallback, useEffect } from 'react';

export interface MentionUser {
  id: string;
  name: string;
  email: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  users: MentionUser[];
  placeholder?: string;
  rows?: number;
}

function getMentionQuery(text: string, cursor: number): { query: string; start: number } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([\w.]*)$/);
  if (!match) return null;
  return { query: match[1], start: cursor - match[0].length };
}

export default function MentionTextarea({
  value,
  onChange,
  users,
  placeholder,
  rows = 3,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [mentionStart, setMentionStart] = useState(0);
  const [query, setQuery] = useState('');

  const filtered = users.filter((u) => {
    const q = query.toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.email.split('@')[0].toLowerCase().includes(q)
    );
  });

  const updateMentionState = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const ctx = getMentionQuery(value, el.selectionStart);
    if (!ctx) {
      setOpen(false);
      return;
    }
    setMentionStart(ctx.start);
    setQuery(ctx.query);
    setOpen(true);
    setHighlight(0);
  }, [value]);

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  const insertMention = (user: MentionUser) => {
    const el = textareaRef.current;
    if (!el) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(el.selectionStart);
    const mention = `@${user.email} `;
    const next = before + mention + after;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const pos = before.length + mention.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="mention-textarea-wrap">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          requestAnimationFrame(updateMentionState);
        }}
        onClick={updateMentionState}
        onKeyUp={updateMentionState}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        rows={rows}
      />
      {open && filtered.length > 0 && (
        <ul className="mention-dropdown" role="listbox">
          {filtered.map((user, i) => (
            <li
              key={user.id}
              role="option"
              aria-selected={i === highlight}
              className={`mention-dropdown-item${i === highlight ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(user);
              }}
            >
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && query && (
        <div className="mention-dropdown mention-dropdown-empty">No team members match &quot;{query}&quot;</div>
      )}
    </div>
  );
}
