import css from '../css/index.css';

import * as THREE from 'three';
import { BoidsApp, BoidsAppOptions } from './BoidsApp.js';

const canvas = document.querySelector('#three-js-canvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas });
const appOptions = new BoidsAppOptions(canvas, renderer, 1600, false);
const app = new BoidsApp(appOptions);

app.run();
