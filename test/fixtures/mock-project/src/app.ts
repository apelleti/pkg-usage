import { AppComponent, DataService, VERSION } from '@mock-scope/components';
import { ButtonComponent } from '@mock-scope/components/button';
import type { ComponentConfig } from '@mock-scope/components';
import { simpleHelper } from 'simple-lib';

// Use the imported symbols
const app = new AppComponent();
const svc = new DataService();
console.log(VERSION);

const btn = new ButtonComponent();

simpleHelper();

const cfg: ComponentConfig = { selector: 'app-root' };
