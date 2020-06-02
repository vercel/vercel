import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { MapPage } from './map';

const routes: Routes = [
  {
    path: '',
    component: MapPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MapPageRoutingModule { }
