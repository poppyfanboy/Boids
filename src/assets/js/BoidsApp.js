import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Boid, Orientation } from './Boids.js';

/**
 * Boids tend to stay inside the bounding box. If they get outside the clipping
 * box, they get sent to the other side of the clipping box.
 */
const BOUNDING_BOX = new THREE.Box3(new THREE.Vector3(-2, -1, -1), new THREE.Vector3(2, 1, 1));
const CLIPPING_BOX_EPSILON = 1;
const CLIPPING_BOX = new THREE.Box3(
    BOUNDING_BOX.min.clone().subScalar(CLIPPING_BOX_EPSILON),
    BOUNDING_BOX.max.clone().addScalar(CLIPPING_BOX_EPSILON)
);

/**
 * Limit delta time passed to the update function of the app to prevent strange
 * behavior when leaving a tab with the app for some time and then opening it
 * once again.
 */
const MAX_DELTA_TIME = 200;

const BOIDS_COUNT = 200;

/**
 * @property {HTMLCanvasElement} canvas
 * @property {THREE.WebGLRenderer} renderer
 * @property {THREE.PerspectiveCamera} camera
 * @property {OrbitControls} controls
 *
 * @property {Number} lastUpdateTime
 * @property {Array.<Boid>} boidsList
 */
export default class BoidsApp {
    /**
     *
     * @param {HTMLCanvasElement} canvas
     * @param {THREE.WebGLRenderer} renderer
     */
    constructor(canvas, renderer) {
        this.canvas = canvas;
        this.renderer = renderer;

        this.camera = new THREE.PerspectiveCamera(
            45,
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            200
        );
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, 0);
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.scene = new THREE.Scene();

        this.lastUpdateTime = null;

        this.boidsList = [];
    }

    run() {
        const directionalLight = new THREE.DirectionalLight(0xffffff);
        directionalLight.position.set(1, 4, 4);
        directionalLight.intensity = 0.4;
        this.scene.add(directionalLight);
        const ambientLight = new THREE.AmbientLight(0xffffff);
        this.scene.add(ambientLight);

        // Bounding box setup
        const clippingBoxSize = new THREE.Vector3();
        BOUNDING_BOX.getSize(clippingBoxSize);

        const boxGeometry = new THREE.BoxGeometry(
            clippingBoxSize.x,
            clippingBoxSize.y,
            clippingBoxSize.z
        );
        const boxWireframeGeometry = new THREE.EdgesGeometry(boxGeometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 2,
        });
        const box = new THREE.LineSegments(boxWireframeGeometry, wireframeMaterial);
        this.scene.add(box);

        // Boids setup
        for (let i = 0; i < BOIDS_COUNT; i++) {
            const position = new THREE.Vector3()
                .random()
                .multiply(
                    BOUNDING_BOX.max
                        .clone()
                        .sub(BOUNDING_BOX.min)
                        .subScalar(2 * 0.3)
                )
                .add(BOUNDING_BOX.min)
                .addScalar(0.3);

            const velocity = new THREE.Vector3()
                .random()
                .subScalar(0.5)
                .multiplyScalar(2 * 0.35);

            const orientation = new Orientation(velocity.clone(), new THREE.Vector3(0, 1, 0));

            this.boidsList.push(
                new Boid(position, velocity, orientation, this.scene, BOUNDING_BOX, CLIPPING_BOX)
            );
        }

        requestAnimationFrame(this.render.bind(this));
    }

    render(currentTime) {
        if (
            this.canvas.width !== this.canvas.clientWidth ||
            this.canvas.height !== this.canvas.clientHeight
        ) {
            this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
            this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
            this.camera.updateProjectionMatrix();
        }

        if (this.lastUpdateTime === null) {
            this.lastUpdateTime = currentTime;
        }
        let deltaTime = currentTime - this.lastUpdateTime;
        deltaTime = Math.min(MAX_DELTA_TIME, deltaTime);

        this.lastUpdateTime = currentTime;

        this.boidsList.forEach((boid) => {
            return boid.update(deltaTime, this.boidsList);
        });

        this.renderer.render(this.scene, this.camera);
        this.controls.update();
        requestAnimationFrame(this.render.bind(this));
    }
}
