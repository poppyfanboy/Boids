import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Boid, BoidOptions } from './Boid.js';
import {
    CombinedBehavior,
    AlignmentBehavior,
    AvoidBox,
    AvoidBoxEdges,
    CohesionBehavior,
    ReturnInsideBox,
    SeparationBehavior,
    ThrustBehavior,
    SeparationCohesionAlignment,
} from './BoidBehaviors.js';

import Octree from './util/Octree.js';

const BACKGROUND_COLOR = 0xebce00;
const BOID_COLOR = 0x81049b;
const OCTREE_COLOR = 0x1528a1;

/**
 * Boids tend to stay inside the bounding box. If they get outside the clipping
 * box, they get sent to the other side of the clipping box.
 */
const BOUNDING_BOX = new THREE.Box3(
    new THREE.Vector3(-8.75, -8.75 / 2, -8.75 / 2),
    new THREE.Vector3(8.75, 8.75 / 2, 8.75 / 2)
);
const CLIPPING_BOX_EPSILON = 1;
const CLIPPING_BOX = new THREE.Box3(
    BOUNDING_BOX.min.clone().subScalar(CLIPPING_BOX_EPSILON),
    BOUNDING_BOX.max.clone().addScalar(CLIPPING_BOX_EPSILON)
);
const BOID_SIZE = 0.12;

const BOID_GEOMETRY = new THREE.ConeBufferGeometry(BOID_SIZE / 2, BOID_SIZE, 8);
const BOID_MATERIAL = new THREE.MeshPhongMaterial({
    color: BOID_COLOR,
    flatShading: true,
});

const BOID_MAX_FORCE = 1.5;
const BOID_PERCEPTION_RADIUS = 0.4;

/**
 * If a boid is slower than this, it does not change its direction when moving.
 */
const BOID_MIN_VELOCITY = 1e-6;
const BOID_MAX_VELOCITY = 0.35;
const BOID_MASS = 1.2;

const FORCES_IMPACTS = {
    avoidBox: 8.0,
    returnInsideBox: 8.0,
    avoidBoxEdges: 8.0,
    separation: 3.0,
    cohesion: 4.0,
    alignment: 8.0,
    thrust: 10.0,
};

const OCTREE_NODE_CAPACITY = 32;
const OCTREE_MAX_DEPTH = 2;

/**
 * Limit delta time passed to the update function of the app to prevent strange
 * behavior when leaving a tab with the app for some time and then opening it
 * once again.
 */
const MAX_DELTA_TIME = 200;

export class BoidsAppOptions {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {THREE.WebGLRenderer} renderer
     * @param {Number} boidsCount
     * @param {boolean} showOctree
     */
    constructor(canvas, renderer, boidsCount = 100, showOctree = false) {
        this.canvas = canvas;
        this.renderer = renderer;
        this.boidsCount = boidsCount;
        this.showOctree = showOctree;
    }
}

/**
 * @property {Array.<Boid>} boidsList
 */
export class BoidsApp {
    /**
     * @param {BoidsAppOptions} options
     */
    constructor(options) {
        this.boidsCount = Math.max(options.boidsCount, 0);
        this.canvas = options.canvas;

        this.renderer = options.renderer;
        this.renderer.setClearColor(BACKGROUND_COLOR);

        this.camera = new THREE.PerspectiveCamera(
            45,
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            200
        );
        this.camera.position.set(0, 0, 16.5);
        this.camera.lookAt(0, 0, 0);

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.scene = new THREE.Scene();
        this.lastUpdateTime = null;

        /**
         * @type {Array.<Boid>}
         */
        this.boidsList = [];

        this.octree = new Octree(
            BOUNDING_BOX,
            OCTREE_NODE_CAPACITY,
            OCTREE_MAX_DEPTH,
            OCTREE_COLOR
        );
        this.showOctree = options.showOctree;
        if (options.showOctree) {
            this.scene.add(this.octree.mesh);
        }
    }

    run() {
        // Scene setup
        const directionalLight = new THREE.DirectionalLight(0xffffff);
        directionalLight.position.set(1, 4, 4);
        directionalLight.intensity = 0.4;
        this.scene.add(directionalLight);

        const ambientLight = new THREE.AmbientLight(0xffffff);
        this.scene.add(ambientLight);

        const boundingBoxSize = new THREE.Vector3();
        BOUNDING_BOX.getSize(boundingBoxSize);

        const boxGeometry = new THREE.BoxGeometry(
            boundingBoxSize.x,
            boundingBoxSize.y,
            boundingBoxSize.z
        );
        const boxWireframeGeometry = new THREE.EdgesGeometry(boxGeometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 2,
        });

        const boundingBox = new THREE.LineSegments(boxWireframeGeometry, wireframeMaterial);
        this.scene.add(boundingBox);

        // Boids behaviors setup
        const avoidBox = new AvoidBox(
            FORCES_IMPACTS.avoidBox,
            BOID_PERCEPTION_RADIUS,
            BOUNDING_BOX
        );
        const avoidBoxEdges = new AvoidBoxEdges(FORCES_IMPACTS.avoidBoxEdges, BOUNDING_BOX);
        const returnInsideBox = new ReturnInsideBox(FORCES_IMPACTS.returnInsideBox, BOUNDING_BOX);
        const separation = new SeparationBehavior(
            this.octree,
            FORCES_IMPACTS.separation,
            3 * BOID_SIZE / 2,
            BOUNDING_BOX
        );
        const cohesion = new CohesionBehavior(
            this.octree,
            FORCES_IMPACTS.cohesion,
            BOID_PERCEPTION_RADIUS,
            BOUNDING_BOX
        );
        const alignment = new AlignmentBehavior(
            this.octree,
            FORCES_IMPACTS.alignment,
            BOID_PERCEPTION_RADIUS,
            BOUNDING_BOX
        );
        const thrust = new ThrustBehavior(FORCES_IMPACTS.thrust);
        const separationCohesionAlignment = new SeparationCohesionAlignment(
            this.octree,
            separation,
            cohesion,
            alignment
        );

        const behaviorsList = [
            avoidBox,
            avoidBoxEdges,
            returnInsideBox,
            separationCohesionAlignment,
            thrust,
        ];
        const behavior = new CombinedBehavior(behaviorsList, BOID_MAX_FORCE);

        // Boids setup
        for (let i = 0; i < this.boidsCount; i++) {
            const position = new THREE.Vector3()
                .random()
                .multiply(
                    BOUNDING_BOX.max
                        .clone()
                        .sub(BOUNDING_BOX.min)
                        .subScalar(2 * BOID_SIZE)
                )
                .add(BOUNDING_BOX.min)
                .addScalar(BOID_SIZE);

            const velocity = new THREE.Vector3()
                .random()
                .subScalar(0.5)
                .multiplyScalar(2 * 0.35);

            const mesh = new THREE.Mesh(BOID_GEOMETRY, BOID_MATERIAL);
            this.scene.add(mesh);

            const options = new BoidOptions(mesh)
                .setVelocity(velocity, BOID_MIN_VELOCITY, BOID_MAX_VELOCITY)
                .setBehavior(behavior, BOID_SIZE, BOID_MASS, CLIPPING_BOX)
                .setInitialPosition(position);

            this.boidsList.push(new Boid(options));
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

        this.octree.clear();
        for (const boid of this.boidsList) {
            this.octree.insert(boid);
        }
        if (this.showOctree) {
            this.octree.updateMesh();
        }

        this.boidsList.forEach((boid) => {
            return boid.update(deltaTime);
        });

        this.renderer.render(this.scene, this.camera);
        this.controls.update();
        requestAnimationFrame(this.render.bind(this));
    }
}
