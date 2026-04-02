import { HighlightDirective, DatePipe } from '@mock-scope/components';
import { ButtonComponent } from '@mock-scope/components/button';

// Mock Angular decorator
function Component(_config: any): ClassDecorator {
  return (target: any) => target;
}

@Component({
  standalone: true,
  imports: [ButtonComponent, HighlightDirective],
  providers: [DatePipe],
  template: '<div></div>',
})
class StandaloneComponent {}
