import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { addWater } from '../lib/water';
import { getTodayIST } from '../utils/dateHelpers';

/** Opened by tapping a water notification: adds one glass, then shows Today. */
export default function WaterAdd() {
  const navigate = useNavigate();
  const { profile } = useApp();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const goal = profile.water?.goal ?? 8;
    addWater(getTodayIST(), 1)
      .then(n => toast.success(n >= goal ? `💧 ${n} of ${goal} — goal reached!` : `💧 Glass added — ${n} of ${goal}`, { id: 'water' }))
      .catch(() => toast.error("Couldn't add the glass — check your connection", { id: 'water' }))
      .finally(() => navigate('/', { replace: true }));
  }, [navigate, profile.water?.goal]);

  return <div className="page pt-24 text-center text-gray-400">Adding a glass…</div>;
}
