import React from 'react';
import { IonApp, setupIonicReact } from '@ionic/react';

import '@ionic/react/css/core.css';

setupIonicReact();

const App: React.FC = () => (
  <IonApp>
    <p>Hello, World!</p>
  </IonApp>
);

export default App;
