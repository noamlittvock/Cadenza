import React, { useState } from 'react';
import { ListsState } from '../types';
import { Plus, X, Tag, Briefcase, Bookmark } from 'lucide-react';

interface Props {
  lists: ListsState;
  setLists: React.Dispatch<React.SetStateAction<ListsState>>;
}

const ListEditor = ({ 
  title, 
  items, 
  onAdd, 
  onRemove, 
  icon: Icon 
}: { 
  title: string; 
  items: string[]; 
  onAdd: (item: string) => void; 
  onRemove: (item: string) => void;
  icon: React.ElementType;
}) => {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (input.trim() && !items.includes(input.trim())) {
      onAdd(input.trim());
      setInput('');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-full">
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
            <Icon size={20} />
        </div>
        <h3 className="font-bold text-lg text-slate-800 dark:text-white">{title}</h3>
      </div>
      
      <div className="flex gap-2 mb-4">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={`Add ${title}...`}
          className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button 
          onClick={handleAdd}
          disabled={!input.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[300px]">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 group">
             <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item}</span>
             <button 
               onClick={() => onRemove(item)}
               className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
             >
               <X size={16} />
             </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-4 italic">No items found</div>
        )}
      </div>
    </div>
  );
};

export const ManageLists: React.FC<Props> = ({ lists, setLists }) => {
  
  const addItem = (key: keyof ListsState, item: string) => {
    setLists(prev => ({
      ...prev,
      [key]: [...prev[key], item]
    }));
  };

  const removeItem = (key: keyof ListsState, item: string) => {
    if (window.confirm(`Remove "${item}" from lists? Existing records using this will not be updated.`)) {
        setLists(prev => ({
        ...prev,
        [key]: prev[key].filter(i => i !== item)
        }));
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
       <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Manage Lists</h2>
        <p className="text-slate-500 dark:text-slate-400">Configure global dropdown options for Positions, Tags, and Classifications.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ListEditor 
          title="Positions" 
          icon={Briefcase}
          items={lists.positions}
          onAdd={(item) => addItem('positions', item)}
          onRemove={(item) => removeItem('positions', item)}
        />
        <ListEditor 
          title="Tags" 
          icon={Tag}
          items={lists.tags}
          onAdd={(item) => addItem('tags', item)}
          onRemove={(item) => removeItem('tags', item)}
        />
        <ListEditor 
          title="Classifications" 
          icon={Bookmark}
          items={lists.classifications}
          onAdd={(item) => addItem('classifications', item)}
          onRemove={(item) => removeItem('classifications', item)}
        />
      </div>
    </div>
  );
};
