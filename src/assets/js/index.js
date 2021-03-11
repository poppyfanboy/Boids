import css from '../css/index.css';

import * as THREE from 'three';
import BoidsApp from './BoidsApp.js';

const canvas = document.querySelector('#three-js-canvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas });
const app = new BoidsApp(canvas, renderer, 200);

app.run();
