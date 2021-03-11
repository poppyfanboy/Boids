/**
 * @property {THREE.Vector3} forward
 * @property {THREE.Vector3} up
 * @property {THREE.Vector3} side
 */
export default class Orientation {
    /**
     * Vectors passed as arguments are *not* cloned inside the constructor.
     * Whoever calls the constructor should take care of cloning the vectors
     * if needed.
     * @param {THREE.Vector3} forward
     * @param {THREE.Vector3} up
     */
    constructor(forward, up) {
        this.forward = forward.normalize();
        this.up = up.normalize();
        this.side = forward.clone().cross(up);
    }

    /**
     * By default previous value of the up component is taken
     * as the approximation.
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
