import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronUp, ChevronDown, Trash2, Plus, Loader2, RefreshCw } from 'lucide-react';
import { SkeletonList } from '../components/ui/Skeleton';
import toast from 'react-hot-toast';
import { tasksApi, type DailyTask } from '../lib/tasks';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { t as tr } from '../lib/i18n';

export default function ManageTasks() {
  const [tasks, setTasks]   = useState<DailyTask[] | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [name, setName]     = useState('');
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setError(null);
    try {
      setTasks((await tasksApi.getToday()).tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Could not load tasks'));
    }
  };

  useEffect(() => { load(); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !tasks) return;
    setAdding(true);
    try {
      const task = await tasksApi.create(trimmed);
      setTasks([...tasks, task]);
      setName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr('Could not add task'));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (task: DailyTask) => {
    if (!tasks) return;
    const ok = await confirmDialog({ title: tr('Delete “{name}”?', { name: task.name }), message: tr('It will be removed from your daily list. Days you already submitted keep their history.'), confirmText: tr('Delete task'), tone: 'danger' });
    if (!ok) return;
    const prev = tasks;
    setTasks(tasks.filter(t => t.id !== task.id));
    try {
      await tasksApi.remove(task.id);
    } catch {
      setTasks(prev);
      toast.error(tr('Could not delete task'));
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!tasks) return;
    const target = index + dir;
    if (target < 0 || target >= tasks.length) return;
    const prev = tasks;
    const next = [...tasks];
    [next[index], next[target]] = [next[target], next[index]];
    setTasks(next);
    try {
      await tasksApi.reorder(next.map(t => t.id));
    } catch {
      setTasks(prev);
      toast.error(tr('Could not reorder'));
    }
  };

  return (
    <div className="page pt-6">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/tasks" className="btn-icon" aria-label={tr('Back')}><ArrowLeft size={18} /></Link>
        <h1 className="page-title">{tr('Manage Tasks')}</h1>
      </div>

      <form onSubmit={add} className="flex gap-2 mb-5">
        <input
          className="input"
          placeholder={tr('e.g. Drink 8 glasses of water')}
          value={name}
          maxLength={100}
          onChange={e => setName(e.target.value)}
          disabled={!tasks}
        />
        <button type="submit" className="btn-primary px-4 disabled:opacity-60" disabled={adding || !name.trim() || !tasks} aria-label={tr('Add task')}>
          {adding ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
        </button>
      </form>

      {error && (
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <button onClick={load} className="btn-secondary"><RefreshCw size={16} /> {tr('Try again')}</button>
        </div>
      )}

      {!error && !tasks && (
        <SkeletonList rows={4} />
      )}

      {tasks && tasks.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">{tr('No tasks yet — add your first one above.')}</p>
      )}

      {tasks && tasks.length > 0 && (
        <div className="card divide-y divide-gray-50 dark:divide-[#2C2C2E]">
          {tasks.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 text-gray-400 disabled:opacity-20" aria-label={tr('Move up')}><ChevronUp size={16} /></button>
                <button onClick={() => move(i, 1)} disabled={i === tasks.length - 1} className="p-0.5 text-gray-400 disabled:opacity-20" aria-label={tr('Move down')}><ChevronDown size={16} /></button>
              </div>
              <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">{t.name}</span>
              <button onClick={() => remove(t)} className="p-2 text-gray-400 hover:text-red-500" aria-label={tr('Delete {name}', { name: t.name })}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center mt-4">
        {tr('Changes apply from today. Days you already submitted keep their history.')}
      </p>
    </div>
  );
}
