// src/components/BudgetAlerts.jsx
import React, { useEffect, useState } from 'react';
import { calculateCategorySpending, checkBudgetAlerts } from '@/utils/budgetService';
import { createAlertIfNotExists } from '@/utils/alertsService';
import { soundService } from '@/utils/soundService';
import { AlertTriangle, X, Volume2, VolumeX } from 'lucide-react';

export const BudgetAlerts = ({ transactions, spendingCaps, currency, rate, userId }) => {
  const [alerts, setAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    if (transactions.length === 0) return;

    const categorySpending = calculateCategorySpending(transactions);
    const newAlerts = checkBudgetAlerts(categorySpending, spendingCaps, currency, rate);
    
    setAlerts(newAlerts);

    // Create alerts in database and play sounds
    newAlerts.forEach(async (alert) => {
      if (userId) {
        await createAlertIfNotExists(userId, {
          type: alert.type,
          title: alert.title,
          message: alert.message,
          icon: '🚨'
        });
      }

      if (soundEnabled) {
        if (alert.severity === 'high') {
          soundService.play('alert');
        } else {
          soundService.play('warning');
        }
      }
    });
  }, [transactions, spendingCaps, currency, rate, userId, soundEnabled]);

  const toggleSound = () => {
    const newState = soundService.toggle();
    setSoundEnabled(newState);
  };

  if (alerts.length === 0) return null;

  return (
    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-orange-800 dark:text-orange-300">
            Budget Alerts ({alerts.length})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className="p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-800/30"
            title={soundEnabled ? "Mute sounds" : "Enable sounds"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        {alerts.map((alert, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg border ${
              alert.severity === 'high' 
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' 
                : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-medium ${
                  alert.severity === 'high' 
                    ? 'text-red-800 dark:text-red-300' 
                    : 'text-orange-800 dark:text-orange-300'
                }`}>
                  {alert.title}
                </p>
                <p className={`text-sm ${
                  alert.severity === 'high' 
                    ? 'text-red-600 dark:text-red-400' 
                    : 'text-orange-600 dark:text-orange-400'
                }`}>
                  {alert.message}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};