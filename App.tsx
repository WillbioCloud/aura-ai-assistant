import React, { useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { Dashboard } from './components/Dashboard';
import { DEFAULT_SETTINGS } from './constants';
import { AssistantSettings } from './types';

const App: React.FC = () => {
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  // O setup pode atualizar as configurações iniciais do usuário
  const [initialSettings, setInitialSettings] = useState<AssistantSettings>(DEFAULT_SETTINGS);

  return (
    <div className="relative w-screen h-screen bg-slate-900 text-white overflow-hidden">
      {/* Background Global */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950 -z-0 pointer-events-none" />

      {/* Seletor de Telas */}
      {!isSetupComplete ? (
        <SetupScreen 
          settings={initialSettings} 
          onUpdateSettings={setInitialSettings}
          onComplete={() => setIsSetupComplete(true)} 
        />
      ) : (
        <Dashboard />
      )}
    </div>
  );
};

export default App;