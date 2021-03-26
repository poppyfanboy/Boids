import './assets/css/index.css';

import * as THREE from 'three';
import { BoidsApp } from './assets/modules/BoidsApp';

const canvas: HTMLCanvasElement | null = document.querySelector('.three-js-canvas');
if (canvas != null) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvas });
    const app = new BoidsApp(
        { canvas: canvas, renderer: renderer, boidsCount: 6000 },
        { showOctree: false },
    );

    app.run();
} else {
    console.log('No \'.three-js-canvas\' found to run boids app on.');
}
