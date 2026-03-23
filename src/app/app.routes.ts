import { Routes } from '@angular/router';

import { guestGuard, authGuard, roleGuard } from './core/auth/auth.guards';
import { CatalogPageComponent } from './features/catalog/catalog-page.component';
import { LoginPageComponent } from './features/auth/login-page.component';
import { RegisterPageComponent } from './features/auth/register-page.component';
import { BuyerDashboardPageComponent } from './features/dashboard/buyer-dashboard-page.component';
import { BuyerOrdersPageComponent } from './features/dashboard/buyer-orders-page.component';
import { CartCheckoutPageComponent } from './features/dashboard/cart-checkout-page.component';
import { SellerProductsPageComponent } from './features/dashboard/seller-products-page.component';
import { SellerOrdersPageComponent } from './features/dashboard/seller-orders-page.component';
import { HomePageComponent } from './features/home/home-page.component';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
	{
		path: '',
		component: ShellComponent,
		children: [
			{
				path: '',
				pathMatch: 'full',
				component: HomePageComponent
			},
			{
				path: 'catalog',
				component: CatalogPageComponent
			},
			{
				path: 'login',
				canActivate: [guestGuard],
				component: LoginPageComponent
			},
			{
				path: 'register',
				canActivate: [guestGuard],
				component: RegisterPageComponent
			},
			{
				path: 'buyer',
				canActivate: [authGuard, roleGuard('buyer')],
				component: BuyerDashboardPageComponent
			},
			{
				path: 'cart',
				canActivate: [authGuard, roleGuard('buyer')],
				component: CartCheckoutPageComponent
			},
			{
				path: 'buyer/orders',
				canActivate: [authGuard, roleGuard('buyer')],
				component: BuyerOrdersPageComponent
			},
			{
				path: 'seller',
				canActivate: [authGuard, roleGuard('seller')],
				component: SellerProductsPageComponent
			},
			{
				path: 'seller/orders',
				canActivate: [authGuard, roleGuard('seller')],
				component: SellerOrdersPageComponent
			}
		]
	},
	{
		path: '**',
		redirectTo: ''
	}
];
