import React from 'react';
import { RouteComponentProps } from 'react-router';
import { IonIcon, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonButton, IonBackButton, IonPage } from '@ionic/react'
import './SpeakerDetail.scss';
import { logoTwitter, logoGithub, logoInstagram } from 'ionicons/icons';
import { connect } from '../data/connect';
import * as selectors from '../data/selectors';
import { Speaker } from '../models/Speaker';

interface OwnProps extends RouteComponentProps {
  speaker?: Speaker;
};

interface StateProps {};

interface DispatchProps {};

interface SpeakerDetailProps extends OwnProps, StateProps, DispatchProps {};

const SpeakerDetail: React.FC<SpeakerDetailProps> = ({ speaker }) => {
  
  if (!speaker) {
    return <div>Speaker not found</div>
  }

  return (
    <IonPage id="speaker-detail">
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/speakers" />
          </IonButtons>
          <IonTitle>{speaker.name}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding speaker-detail speaker-page-list">
        <div className="ion-text-center">
          <img src={speaker.profilePic} alt={speaker.name} />
          <br />
          <IonButton fill="clear" size="small" color="twitter">
            <IonIcon icon={logoTwitter} slot="icon-only"></IonIcon>
          </IonButton>
          <IonButton fill="clear" size="small" color="github">
            <IonIcon icon={logoGithub} slot="icon-only"></IonIcon>
          </IonButton>
          <IonButton fill="clear" size="small" color="instagram">
            <IonIcon icon={logoInstagram} slot="icon-only"></IonIcon>
          </IonButton>
        </div>

        <p>{speaker.about}</p>
      </IonContent>
    </IonPage>
  );
};


export default connect({
  mapStateToProps: (state, ownProps) => ({
    speaker: selectors.getSpeaker(state, ownProps)
  }),
  component: SpeakerDetail
});
