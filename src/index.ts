import './assets/css/index.css';

import * as THREE from 'three';
import { BoidsApp, BoidsAppOptions, BoidsAppDebugOptions, BvhType } from './assets/modules/BoidsApp';

const canvas: HTMLCanvasElement | null = document.querySelector('.three-js-canvas');
if (canvas != null) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvas });
    const app = new BoidsApp(
        new BoidsAppOptions(canvas, renderer, 10_000, BvhType.BINARY_BVH),
        new BoidsAppDebugOptions(false),
    );

    app.run();
} else {
    console.log('No \'.three-js-canvas\' found to run boids app on.');
}
