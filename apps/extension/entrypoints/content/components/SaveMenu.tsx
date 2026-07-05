import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { List } from '@vitrum/model';

interface Props {
  lists: List[];
  onSave: (listId: string) => void;
  onCreateAndSave: (name: string) => void;
  onClose: () => void;
}

/** Dropdown for picking (or creating) a list to save into. */
export function SaveMenu({ lists, onSave, onCreateAndSave, onClose }: Props) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  return (
    <div className="vt-save-menu">
      {lists.map((list) => (
        <button
          key={list.id}
          className="vt-save-item"
          onClick={() => {
            onSave(list.id);
            onClose();
          }}
        >
          <span className="vt-save-dot" />
          {list.name}
        </button>
      ))}
      {creating ? (
        <form
          className="vt-save-new"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) {
              onCreateAndSave(newName.trim());
              onClose();
            }
          }}
        >
          <input
            className="vt-input"
            autoFocus
            placeholder="List name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </form>
      ) : (
        <button className="vt-save-item vt-save-create" onClick={() => setCreating(true)}>
          <Plus size={13} /> New list…
        </button>
      )}
    </div>
  );
}
