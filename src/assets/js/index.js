import css from '../css/index.css';
import * as THREE from 'three';
import BoidsApp from './BoidsApp.js';

const BACKGROUND_COLOR = 0xebce00;

const canvas = document.querySelector('#three-js-canvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas });
renderer.setClearColor(BACKGROUND_COLOR);

const app = new BoidsApp(canvas, renderer);
app.run();
