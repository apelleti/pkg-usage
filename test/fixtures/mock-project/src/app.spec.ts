import { AppComponent } from '@mock-scope/components';
import { formatDate } from '@mock-scope/utils';

// Test file — should only be included with --include-tests
const comp = new AppComponent();
formatDate(new Date());
