// Imports through a local barrel — should still count as usage of @mock-scope/utils
import { formatDate } from './barrel';

const result = formatDate(new Date());
