import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { addWater } from '../lib/water';
import { getTodayIST } from '../utils/dateHelpers';
import { t } from '../lib/i18n';

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
      .then(n => toast.success(n >= goal ? t('💧 {n} of {goal} — goal reached!', { n, goal }) : t('💧 Glass added — {n} of {goal}', { n, goal }), { id: 'water' }))
      .catch(() => toast.error(t("Couldn't add the glass — check your connection"), { id: 'water' }))
      .finally(() => navigate('/', { replace: true }));
  }, [navigate, profile.water?.goal]);

  return <div className="page pt-24 text-center text-gray-400">{t('Adding a glass…')}</div>;
}
