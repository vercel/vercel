import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SessionDetailPage } from './session-detail';

const routes: Routes = [
  {
    path: '',
    component: SessionDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SessionDetailPageRoutingModule { }
