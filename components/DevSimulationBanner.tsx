import React from 'react';
import { X, Calendar, UserCog } from 'lucide-react';
import { useDevSimulation } from '../context/DevSimulationContext';

export const DevSimulationBanner: React.FC = () => {
  const { simulatedDate, simulatedRole, simulationActive, clearAllSimulations } = useDevSimulation();

  if (!simulationActive) return null;

  return (
    <div className="sticky top-0 z-[200] bg-violet-600 text-white px-4 py-2 flex items-center justify-between text-sm font-medium shadow-lg">
      <div className="flex items-center gap-4">
        <span className="font-bold uppercase tracking-wider text-[10px] bg-white/20 px-2 py-0.5 rounded">
          Simulation Active
        </span>
        {simulatedRole && (
          <span className="flex items-center gap-1.5">
            <UserCog size={14} />
            {simulatedRole.label}
          </span>
        )}
        {simulatedDate && (
          <span className="flex items-center gap-1.5">
            <Calendar size={14} />
            {simulatedDate.toLocaleDateString()}
          </span>
        )}
      </div>
      <button
        onClick={clearAllSimulations}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded transition-colors"
      >
        <X size={14} />
        Exit Simulation
      </button>
    </div>
  );
};
