import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
    rayVsAabb,
    lineVsAabb,
    distanceToAabbBoundary,
    vectorFromAabbBoundary,
} from './util/Collisions.js';

// Applied to all boids
const BOIDS_COUNT = 1000;
const BOID_COLOR = 0x00587a;
const BOID_SIZE = 0.08;
const BOUNDING_BOX = new THREE.Box3(
    new THREE.Vector3(-1, -0.5, -0.5),
    new THREE.Vector3(1, 0.5, 0.5)
);

// Default parameters applied for each individual boid
/**
 * If a boid is slower than this, it does not change its direction when moving.
 */
const BOID_MIN_SPEED = 1e-6;
const BOID_MAX_SPEED = 0.3;
const BOID_MAX_FORCE = 0.1;
const BOID_MASS = 1.0;
const BOID_PERCEPTION_RADIUS = 0.35;

const boidGeometry = new THREE.ConeBufferGeometry(BOID_SIZE / 2, BOID_SIZE, 8);
const boidMaterial = new THREE.MeshPhongMaterial({
    color: BOID_COLOR,
    flatShading: true,
});

/**
 * After boid is wrapped on the other side of the bounding AABB, it is brought
 * away from each border by this distance.
 */
const BOUNDARY_EPSILON = 0.025;

/**
 *
 * @property {THREE.Vector3} forward
 * @property {THREE.Vector3} up
 * @property {THREE.Vector3} side
 */
class Orientation {
    /**
     * Vectors passed as arguments are *not* cloned inside the constructor.
     * Whoever calls the constructor should take care of cloning the vectors if needed.
     * @param {THREE.Vector3} forward
     * @param {THREE.Vector3} up
     */
    constructor(forward, up) {
        this.forward = forward.normalize();
        this.up = up.normalize();
        this.side = forward.clone().cross(up);
    }

    /**
     * By default previous value of the up component is taken as the approximation.
     * @param {THREE.Vector3} newVelocity
     * @param {THREE.Vector3} approximateUp
     */
    update(newVelocity, approximateUp) {
        this.forward.copy(newVelocity).normalize();

        if (approximateUp === undefined) {
            this.side.copy(this.forward).cross(this.up);
        } else {
            this.side.copy(this.forward).cross(approximateUp);
        }

        this.up.copy(this.forward).cross(this.side);
    }

    clone() {
        return new Orientation(this.forward, this.up);
    }
}

/**
 *
 * @property {Number} mass
 * @property {THREE.Vector3} position
 * @property {THREE.Vector3} velocity
 * @property {Orientation} orientation
 * @property {Number} maxForce
 * @property {Number} maxSpeed
 *
 * @property {THREE.Mesh} mesh
 * @property {THREE.Box3} boundingBox
 */
class Boid {
    /**
     *
     * @param {Number} mass
     * @param {THREE.Vector3} position
     * @param {THREE.Vector3} velocity
     * @param {Orientation} orientation
     * @param {Number} maxForce
     * @param {Number} maxSpeed
     *
     * @param {THREE.Object3D} scene
     * @param {THREE.Box3} boundingBox
     */
    constructor(mass, position, velocity, orientation, maxForce, maxSpeed, scene, boundingBox) {
        this.mass = mass;
        this.position = position;
        this.velocity = velocity;
        this.orientation = orientation;
        this.maxSpeed = maxSpeed;
        this.maxForce = maxForce;
        this.boundingBox = boundingBox;

        this.mesh = new THREE.Mesh(boidGeometry, boidMaterial);
        scene.add(this.mesh);
    }

    update(dt) {
        const dtSeconds = dt * 0.001;

        if (
            distanceToAabbBoundary(this.position, this.boundingBox) > 0 &&
            !this.boundingBox.containsPoint(this.position)
        ) {
            const ray = new THREE.Ray(this.position.clone(), this.velocity.clone());
            this.position
                .copy(
                    lineVsAabb(ray, this.boundingBox).far.clamp(
                        this.boundingBox.min,
                        this.boundingBox.max
                    )
                )
                .add(vectorFromAabbBoundary(this.position, this.boundingBox, BOUNDARY_EPSILON));
        }

        const steeringForce = new THREE.Vector3();

        // Avoid bounding box
        const ray = new THREE.Ray(this.position.clone(), this.velocity.clone());
        const boundaryIntersections = rayVsAabb(ray, this.boundingBox, BOID_PERCEPTION_RADIUS);
        if (boundaryIntersections !== null) {
            const target = boundaryIntersections.point
                .clone()
                .add(boundaryIntersections.normal.clone().multiplyScalar(2 * BOID_SIZE));
            const desiredVelocity = this.position
                .clone()
                .sub(target)
                .normalize()
                .multiplyScalar(7 * dtSeconds);
            steeringForce.add(desiredVelocity.sub(this.velocity));
        }

        // Thrust
        steeringForce.add(this.orientation.forward.clone().multiplyScalar(dtSeconds));

        steeringForce.clampLength(0, this.maxForce);

        this.velocity
            .add(steeringForce.divideScalar(this.mass).multiplyScalar(dtSeconds))
            .clampLength(0, this.maxSpeed);

        if (this.velocity.length() > BOID_MIN_SPEED) {
            this.orientation.update(this.velocity.clone());
            this.mesh.lookAt(this.position.clone().add(this.orientation.forward));
            this.mesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        }

        this.position.add(this.velocity.clone().multiplyScalar(dtSeconds));
        this.mesh.position.copy(this.position);
    }
}

/**
 *
 * @param {HTMLCanvasElement} canvas
 * @param {THREE.WebGLRenderer} renderer
 */
export function runBoids(canvas, renderer) {
    // Controls and graphics setup
    const camera = new THREE.PerspectiveCamera(
        45,
        canvas.clientWidth / canvas.clientHeight,
        0.1,
        200
    );
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);

    const scene = new THREE.Scene();
    const controls = new OrbitControls(camera, canvas);

    const directionalLight = new THREE.DirectionalLight(0xffffff);
    directionalLight.position.set(1, 4, 4);
    directionalLight.intensity = 0.4;
    scene.add(directionalLight);
    const ambientLight = new THREE.AmbientLight(0xffffff);
    scene.add(ambientLight);

    // Bounding box setup
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
    const box = new THREE.LineSegments(boxWireframeGeometry, wireframeMaterial);
    scene.add(box);

    // Boids setup
    const boidsList = [];
    for (let i = 0; i < BOIDS_COUNT; i++) {
        const position = new THREE.Vector3()
            .random()
            .multiply(BOUNDING_BOX.max.clone().sub(BOUNDING_BOX.min))
            .add(BOUNDING_BOX.min);

        const velocity = new THREE.Vector3()
            .random()
            .subScalar(0.5)
            .multiplyScalar(2 * BOID_MAX_SPEED);

        const orientation = new Orientation(velocity.clone(), new THREE.Vector3(0, 1, 0));

        boidsList.push(
            new Boid(
                BOID_MASS,
                position,
                velocity,
                orientation,
                BOID_MAX_FORCE,
                BOID_MAX_SPEED,
                scene,
                BOUNDING_BOX
            )
        );
    }

    let lastUpdateTime = null;
    function render(currentTime) {
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
        }

        if (lastUpdateTime === null) {
            lastUpdateTime = currentTime;
        }
        const deltaTime = currentTime - lastUpdateTime;
        lastUpdateTime = currentTime;

        boidsList.forEach((boid) => {
            return boid.update(deltaTime, boidsList);
        });

        renderer.render(scene, camera);
        controls.update();
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}
