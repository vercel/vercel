import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SignupPage } from './signup';

const routes: Routes = [
  {
    path: '',
    component: SignupPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SignupPageRoutingModule { }
