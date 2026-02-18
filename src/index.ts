import './assets/css/index.css';

import * as THREE from 'three';
import { BoidsApp, BoidsAppOptions, BoidsAppDebugOptions, BvhType } from './assets/modules/BoidsApp';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const app = new BoidsApp(
    new BoidsAppOptions(renderer, 10_000, BvhType.BINARY_BVH),
    new BoidsAppDebugOptions(false),
);

app.run();
