import { ButtonComponent } from '@mock-scope/components/button';
import { HighlightDirective, DatePipe } from '@mock-scope/components';

function Component(_config: any): ClassDecorator {
  return (target: any) => target;
}

@Component({
  standalone: true,
  imports: [ButtonComponent, HighlightDirective],
  templateUrl: './template.component.html',
})
class TemplateComponent {}
