import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

/**
 * @ngdoc react
 * @name Panel
 * @description Panel Component to be used in a preview pane
 */
export const Panel: React.FunctionComponent<any> = ({children, className}) => (
    <div
        className={classNames(
            'sd-preview-panel',
            className,
        )}
    >
        {children}
    </div>
);

Panel.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
};
