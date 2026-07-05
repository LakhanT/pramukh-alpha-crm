import { useState } from 'react';
import { FileText, Image, Link2, Type } from 'lucide-react';
import { api } from '../services/api';
import type { TaskProof } from '../types';

function resolveProofUrl(url?: string | null): string {
  if (!url) return '#';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProofIcon({ proof }: { proof: TaskProof }) {
  if (proof.proofType === 'LINK') return <Link2 size={16} />;
  if (proof.proofType === 'TEXT') return <Type size={16} />;
  if (proof.mimeType?.startsWith('image/')) return <Image size={16} />;
  return <FileText size={16} />;
}

interface ProofSectionProps {
  taskId: string;
  proofs: TaskProof[];
  onChange: () => void;
}

export default function ProofSection({ taskId, proofs, onChange }: ProofSectionProps) {
  const [mode, setMode] = useState<'file' | 'link' | 'text'>('file');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      await api.uploadAttachment(taskId, file);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleLink = async () => {
    if (!linkUrl.trim()) return;
    setError('');
    setBusy(true);
    try {
      await api.addProofLink(taskId, linkUrl.trim(), linkTitle.trim() || undefined);
      setLinkUrl('');
      setLinkTitle('');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add link');
    } finally {
      setBusy(false);
    }
  };

  const handleText = async () => {
    if (!textContent.trim()) return;
    setError('');
    setBusy(true);
    try {
      await api.addProofText(taskId, textContent.trim(), textTitle.trim() || undefined);
      setTextContent('');
      setTextTitle('');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">Proof &amp; attachments</div>
      <div className="card-desc">Add photos, PDFs, documents, proof links, or text notes as evidence for this task.</div>

      {proofs.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>No proof added yet.</p>
      )}

      <div className="proof-list">
        {proofs.map((p) => (
          <div key={p.id} className="proof-item">
            <div className="proof-item-icon"><ProofIcon proof={p} /></div>
            <div className="proof-item-body">
              <div className="proof-item-title">{p.fileName}</div>
              {p.proofType === 'TEXT' && p.textContent && (
                <p className="proof-text-content">{p.textContent}</p>
              )}
              {p.proofType === 'LINK' && p.fileUrl && (
                <a href={resolveProofUrl(p.fileUrl)} target="_blank" rel="noreferrer" className="proof-link">
                  {p.fileUrl}
                </a>
              )}
              {p.proofType === 'FILE' && p.mimeType?.startsWith('image/') && p.fileUrl && (
                <a href={resolveProofUrl(p.fileUrl)} target="_blank" rel="noreferrer">
                  <img src={resolveProofUrl(p.fileUrl)} alt={p.fileName} className="proof-image-preview" />
                </a>
              )}
              {p.proofType === 'FILE' && p.fileUrl && !p.mimeType?.startsWith('image/') && (
                <a href={resolveProofUrl(p.fileUrl)} target="_blank" rel="noreferrer" className="proof-link">
                  Download{p.fileSize ? ` · ${formatFileSize(p.fileSize)}` : ''}
                </a>
              )}
              {p.uploadedBy && (
                <div className="proof-meta">Added by {p.uploadedBy.name}</div>
              )}
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12, padding: '4px 8px', flexShrink: 0 }}
              onClick={() => api.deleteAttachment(p.id).then(onChange)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      <div className="proof-add-tabs">
        <button type="button" className={`proof-add-tab ${mode === 'file' ? 'active' : ''}`} onClick={() => setMode('file')}>
          <Image size={14} /> File
        </button>
        <button type="button" className={`proof-add-tab ${mode === 'link' ? 'active' : ''}`} onClick={() => setMode('link')}>
          <Link2 size={14} /> Link
        </button>
        <button type="button" className={`proof-add-tab ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')}>
          <Type size={14} /> Text
        </button>
      </div>

      {mode === 'file' && (
        <div className="proof-add-panel">
          <label className="proof-file-label">
            <span className="btn-secondary" style={{ display: 'inline-block', cursor: 'pointer' }}>
              {busy ? 'Uploading…' : 'Choose photo or document'}
            </span>
            <input
              type="file"
              className="proof-file-input"
              accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
              onChange={handleFile}
              disabled={busy}
            />
          </label>
          <p className="proof-hint">Photos (JPG, PNG), PDF, Word, Excel, or text files</p>
        </div>
      )}

      {mode === 'link' && (
        <div className="proof-add-panel">
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Proof link URL</label>
            <input
              type="url"
              placeholder="https://drive.google.com/… or any proof URL"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Label (optional)</label>
            <input placeholder="e.g. Screenshot on Drive" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
          </div>
          <button type="button" className="btn-primary" onClick={handleLink} disabled={busy || !linkUrl.trim()}>
            Add link
          </button>
        </div>
      )}

      {mode === 'text' && (
        <div className="proof-add-panel">
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Title (optional)</label>
            <input placeholder="e.g. Completion notes" value={textTitle} onChange={(e) => setTextTitle(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Proof text</label>
            <textarea
              rows={4}
              placeholder="Paste proof details, reference numbers, or notes…"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary" onClick={handleText} disabled={busy || !textContent.trim()}>
            Save text proof
          </button>
        </div>
      )}

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}
