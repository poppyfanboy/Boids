import * as THREE from 'three';
import { runBoids } from './Boids.js';

const BACKGROUND_COLOR = 0xebce00;

const canvas = document.querySelector('#three-js-canvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas });
renderer.setClearColor(BACKGROUND_COLOR);

runBoids(canvas, renderer);
