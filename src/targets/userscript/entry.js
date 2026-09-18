/**
 * Tampermonkey target. The core default host already speaks GM_*, so this entry
 * only has to start the panel.
 */
import { bootstrapWhenReady } from '../../core/main.js';

bootstrapWhenReady();
