import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AccountPage } from './account';

const routes: Routes = [
  {
    path: '',
    component: AccountPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AccountPageRoutingModule { }
