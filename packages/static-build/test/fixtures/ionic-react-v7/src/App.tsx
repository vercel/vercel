import React from 'react';
import { IonApp, IonContent, IonPage, setupIonicReact } from '@ionic/react';

import '@ionic/react/css/core.css';

setupIonicReact();

const App: React.FC = () => (
  <IonApp>
    <IonPage>
      <IonContent><h1>Hello, World!</h1></IonContent>
    </IonPage>
  </IonApp>
);

export default App;
